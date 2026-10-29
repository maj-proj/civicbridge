"""
CivicBridge — YOLOv8 detection service for garbage and potholes.

Pure vision: this service classifies an image and reports what it saw. It
holds no database and no secrets. Priority scoring, zone sensitivity,
authority routing and email all live in the Next.js app, so tuning the
algorithm never means redeploying a model.

The one exception is pothole severity, which is derived from the detected
box geometry and so can only be computed here.

Endpoints
    GET  /                 service info
    GET  /health           liveness, used by the frontend to degrade
    GET  /classes          the garbage model's classes and their categories
    POST /predict/garbage  garbage detection      (alias: POST /predict)
    POST /predict/pothole  pothole detection      (alias: POST /detect/pothole)
"""

import base64
import os
import uuid
from io import BytesIO

import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
from utils.google_maps import get_place_details
from fastapi.staticfiles import StaticFiles
from PIL import Image
from ultralytics import YOLO

from categories import resolve_category

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

GARBAGE_MODEL_PATH = os.getenv("GARBAGE_MODEL_PATH", "best.pt")
POTHOLE_MODEL_PATH = os.getenv("POTHOLE_MODEL_PATH", "best_pothole.pt")

GARBAGE_CONF = float(os.getenv("GARBAGE_CONF_THRESHOLD", "0.25"))
POTHOLE_CONF = float(os.getenv("POTHOLE_CONF_THRESHOLD", "0.20"))

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))  # 10MB
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
ANNOTATED_DIR = os.path.join(UPLOAD_DIR, "annotated")

# Fraction of the frame a single pothole must cover to score 100.
POTHOLE_FULL_SEVERITY_AREA = float(os.getenv("POTHOLE_FULL_SEVERITY_AREA", "0.15"))

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}

# CORS is restricted to the frontend. Override with a comma-separated list.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(ANNOTATED_DIR, exist_ok=True)

app = FastAPI(title="CivicBridge Detection API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Annotated images are served back so the frontend and the authority email
# can show the detection overlay.
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")

garbage_model = YOLO(GARBAGE_MODEL_PATH)
pothole_model = YOLO(POTHOLE_MODEL_PATH)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def read_validated_image(file: UploadFile) -> tuple[str, int, int]:
    """
    Writes the upload to disk and returns (path, width, height).

    Validates the declared type, the size, and that the bytes actually decode
    as an image — a correct Content-Type header proves nothing on its own.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file.content_type}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}",
        )

    contents = await file.read()

    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit.",
        )

    file_id = str(uuid.uuid4())
    image_path = os.path.join(UPLOAD_DIR, f"{file_id}.jpg")

    try:
        with Image.open(BytesIO(contents)) as img:
            rgb = img.convert("RGB")
            width, height = rgb.size
            rgb.save(image_path, format="JPEG")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="File is not a readable image.")

    return image_path, width, height


def save_overlay(result, file_id: str) -> str | None:
    """Writes the model's own annotated render and returns its served path."""
    try:
        plotted = result.plot()  # BGR ndarray
        name = f"{file_id}_annotated.jpg"
        Image.fromarray(plotted[:, :, ::-1]).save(
            os.path.join(ANNOTATED_DIR, name), "JPEG"
        )
        return f"/static/annotated/{name}"
    except Exception as error:  # non-fatal: the detection still stands
        print(f"Could not render annotated image: {error}")
        return None


def discard(image_path: str | None) -> None:
    """
    The source upload is transient — the frontend persists its own copy to
    object storage. Only the annotated overlay is kept.
    """
    if image_path and os.path.exists(image_path):
        try:
            os.remove(image_path)
        except OSError:
            pass


def calculate_severity_score(
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    image_width: int,
    image_height: int,
) -> dict:
    """
    Severity of a single pothole from how much of the frame it fills.

    A proxy, not a measurement: a close-up of a small hole and a distant shot
    of a large one can produce the same ratio. Treated as advisory, and the
    frontend says so in the notice it sends.
    """
    box_width = max(0, x2 - x1)
    box_height = max(0, y2 - y1)

    image_area = image_width * image_height
    if image_area <= 0:
        raise ValueError("Image dimensions must be positive")

    area_ratio = (box_width * box_height) / image_area

    severity_score = round(
        min((area_ratio / POTHOLE_FULL_SEVERITY_AREA) * 100, 100.0), 2
    )

    if severity_score < 35:
        severity_level = "Low"
    elif severity_score < 70:
        severity_level = "Medium"
    else:
        severity_level = "High"

    return {"severity_score": severity_score, "severity_level": severity_level}


# ---------------------------------------------------------------------------
# Service routes
# ---------------------------------------------------------------------------


@app.get("/")
def home():
    return {
        "message": "CivicBridge Detection API is running",
        "models": {
            "garbage": {
                "path": GARBAGE_MODEL_PATH,
                "classes": len(garbage_model.names),
            },
            "pothole": {
                "path": POTHOLE_MODEL_PATH,
                "classes": len(pothole_model.names),
            },
        },
    }


@app.get("/health")
def health():
    """Liveness probe. The frontend degrades gracefully when this fails."""
    return {
        "status": "ok",
        "model_loaded": garbage_model is not None and pothole_model is not None,
        "class_count": len(garbage_model.names),
        "conf_threshold": GARBAGE_CONF,
        "models": {
            "garbage": {
                "loaded": garbage_model is not None,
                "class_count": len(garbage_model.names),
                "conf_threshold": GARBAGE_CONF,
            },
            "pothole": {
                "loaded": pothole_model is not None,
                "class_count": len(pothole_model.names),
                "conf_threshold": POTHOLE_CONF,
            },
        },
    }


@app.get("/classes")
def classes():
    """
    The garbage model's real class list and how each maps to a waste
    category. Use it to verify the category weights in the frontend scorer.
    """
    return {
        "classes": [
            {"id": idx, "name": name, "category": resolve_category(name)}
            for idx, name in garbage_model.names.items()
        ],
        "pothole_classes": [
            {"id": idx, "name": name} for idx, name in pothole_model.names.items()
        ],
    }


# ---------------------------------------------------------------------------
# Garbage detection
# ---------------------------------------------------------------------------


@app.post("/predict/garbage")
@app.post("/predict")  # retained: the frontend's original path
async def predict_garbage(
    file: UploadFile = File(...),
    place_query: Optional[str] = Query(
        None,
        description="Optional textual location (e.g., address or landmark) to associate with this detection.",
    ),
):

    image_path = None

    try:
        image_path, image_width, image_height = await read_validated_image(file)
        file_id = os.path.splitext(os.path.basename(image_path))[0]

        results = garbage_model.predict(
            source=image_path, conf=GARBAGE_CONF, verbose=False
        )

        # Per-class aggregation. `detections` carries one row per unique class
        # with that class's highest confidence; `total_objects_detected`
        # counts every individual box.
        class_stats: dict[str, dict] = {}
        total_objects = 0

        # Coverage mask gives a true union area, so overlapping boxes are not
        # double-counted the way summing box areas would.
        coverage = np.zeros((image_height, image_width), dtype=bool)

        annotated_url = None

        for result in results:
            boxes = result.boxes

            if boxes is not None:
                for box in boxes:
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0]) * 100.0
                    class_name = garbage_model.names[class_id]
                    category = resolve_category(class_name)

                    total_objects += 1

                    stat = class_stats.setdefault(
                        class_name,
                        {
                            "class": class_name,
                            "category": category,
                            "confidence": 0.0,
                            "count": 0,
                        },
                    )
                    stat["count"] += 1
                    stat["confidence"] = max(stat["confidence"], confidence)

                    x1, y1, x2, y2 = (int(v) for v in box.xyxy[0].tolist())
                    x1 = max(0, min(x1, image_width))
                    x2 = max(0, min(x2, image_width))
                    y1 = max(0, min(y1, image_height))
                    y2 = max(0, min(y2, image_height))
                    if x2 > x1 and y2 > y1:
                        coverage[y1:y2, x1:x2] = True

            if annotated_url is None:
                annotated_url = save_overlay(result, file_id)

        category_counts: dict[str, int] = {}
        for stat in class_stats.values():
            category_counts[stat["category"]] = (
                category_counts.get(stat["category"], 0) + stat["count"]
            )

        category_distribution = [
            {
                "category": category,
                "object_count": count,
                "percentage": round(count / total_objects * 100, 2)
                if total_objects
                else 0.0,
            }
            for category, count in sorted(
                category_counts.items(), key=lambda kv: kv[1], reverse=True
            )
        ]

        detections = sorted(
            (
                {
                    "class": stat["class"],
                    "confidence": round(stat["confidence"], 2),
                    "category": stat["category"],
                    "object_count": stat["count"],
                }
                for stat in class_stats.values()
            ),
            key=lambda d: d["confidence"],
            reverse=True,
        )

        total_area_ratio = round(
            float(coverage.sum()) / float(image_width * image_height), 4
        )

        # Optional place lookup for garbage detection
        place_info = None
        if place_query:
            place_info = get_place_details(place_query)

        map_url = None
        if place_info:
            map_url = (
                "https://www.google.com/maps/embed/v1/place"
                f"?key={os.getenv('GOOGLE_MAPS_API_KEY')}"
                f"&q={place_info['lat']},{place_info['lng']}"
                "&zoom=15"
            )

        return JSONResponse(
            content={
                "success": True,
                "issue_type": "garbage",
                "image_analysis": {
                    "total_objects_detected": total_objects,
                    "total_categories_detected": len(category_counts),
                    "percentage_basis": "object_count",
                    # Additive signal: union of all boxes over the frame area.
                    # Object count alone cannot tell 20 bottle caps from 20
                    # dump bags; this can. Consumers may ignore it safely.
                    "total_area_ratio": total_area_ratio,
                    "image_width": image_width,
                    "image_height": image_height,
                },
                "detections": detections,
                "category_distribution": category_distribution,
                "annotated_image_url": annotated_url,
                "place": place_info,
                "place_map_url": map_url,
            }
        )

    except HTTPException as http_error:
        return JSONResponse(
            status_code=http_error.status_code,
            content={"success": False, "error": http_error.detail},
        )

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Garbage detection failed: {e}"},
        )

    finally:
        discard(image_path)


# ---------------------------------------------------------------------------
# Pothole detection
# ---------------------------------------------------------------------------


@app.post("/predict/pothole")
@app.post("/detect/pothole")  # retained: the original pothole path
async def predict_pothole(
    file: UploadFile = File(...),
    include_base64: bool = Query(
        False,
        description="Also return the overlay inline as base64. Off by default: "
        "a multi-megabyte string in JSON is far heavier than a URL.",
    ),
    place_query: Optional[str] = Query(
        None,
        description="Optional textual location (e.g., address or landmark) to associate with this detection.",
    ),
):
    image_path = None

    try:
        image_path, image_width, image_height = await read_validated_image(file)
        file_id = os.path.splitext(os.path.basename(image_path))[0]

        results = pothole_model.predict(
            source=image_path, conf=POTHOLE_CONF, verbose=False
        )

        detections = []
        annotated_url = None
        worst_score = 0.0
        coverage = np.zeros((image_height, image_width), dtype=bool)

        for result in results:
            boxes = result.boxes

            if boxes is not None:
                for box in boxes:
                    x1, y1, x2, y2 = (int(v) for v in box.xyxy[0].tolist())
                    x1 = max(0, min(x1, image_width))
                    x2 = max(0, min(x2, image_width))
                    y1 = max(0, min(y1, image_height))
                    y2 = max(0, min(y2, image_height))

                    confidence = float(box.conf[0]) * 100.0
                    class_name = pothole_model.names[int(box.cls[0])]

                    severity = calculate_severity_score(
                        x1=x1,
                        y1=y1,
                        x2=x2,
                        y2=y2,
                        image_width=image_width,
                        image_height=image_height,
                    )
                    worst_score = max(worst_score, severity["severity_score"])

                    if x2 > x1 and y2 > y1:
                        coverage[y1:y2, x1:x2] = True

                    detections.append(
                        {
                            "id": len(detections) + 1,

                            "class": class_name,
                            "confidence": round(confidence, 2),
                            "severity_score": severity["severity_score"],
                            "severity_level": severity["severity_level"],
                            "bounding_box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                        }
                    )

            if annotated_url is None:
                annotated_url = save_overlay(result, file_id)

        total_objects = len(detections)

        total_area_ratio = round(
            float(coverage.sum()) / float(image_width * image_height), 4
        )

        if worst_score < 35:
            worst_level = "Low"
        elif worst_score < 70:
            worst_level = "Medium"
        else:
            worst_level = "High"

        # Optional place lookup for pothole detection
        place_info = None
        if place_query:
            place_info = get_place_details(place_query)

        map_url = None
        if place_info:
            map_url = (
                "https://www.google.com/maps/embed/v1/place"
                f"?key={os.getenv('GOOGLE_MAPS_API_KEY')}"
                f"&q={place_info['lat']},{place_info['lng']}"
                "&zoom=15"
            )

        payload = {
            "success": True,
            "issue_type": "pothole",
            "image_analysis": {
                "total_objects_detected": total_objects,
                "issue_detected": total_objects > 0,
                "total_area_ratio": total_area_ratio,
                "image_width": image_width,
                "image_height": image_height,
                # The worst single defect in the frame, so a caller does not
                # have to walk the detections to find it.
                "worst_severity_score": worst_score if total_objects else 0.0,
                "worst_severity_level": worst_level if total_objects else "Low",
            },
            "detections": detections,
            "annotated_image_url": annotated_url,
            "place": place_info,
            "place_map_url": map_url,

            "success": True,
            "issue_type": "pothole",
            "image_analysis": {
                "total_objects_detected": total_objects,
                "issue_detected": total_objects > 0,
                "total_area_ratio": total_area_ratio,
                "image_width": image_width,
                "image_height": image_height,
                # The worst single defect in the frame, so a caller does not
                # have to walk the detections to find it.
                "worst_severity_score": worst_score if total_objects else 0.0,
                "worst_severity_level": worst_level if total_objects else "Low",
            },
            "detections": detections,
            "annotated_image_url": annotated_url,

            "success": True,
            "issue_type": "pothole",
            "image_analysis": {
                "total_objects_detected": total_objects,
                "issue_detected": total_objects > 0,
                "total_area_ratio": total_area_ratio,
                "image_width": image_width,
                "image_height": image_height,
                # The worst single defect in the frame, so a caller does not
                # have to walk the detections to find it.
                "worst_severity_score": worst_score if total_objects else 0.0,
                "worst_severity_level": worst_level if total_objects else "Low",
            },
            "detections": detections,
            "annotated_image_url": annotated_url,
        }

        if include_base64 and annotated_url:
            overlay_path = os.path.join(
                ANNOTATED_DIR, os.path.basename(annotated_url)
            )
            try:
                with open(overlay_path, "rb") as handle:
                    payload["annotated_image"] = base64.b64encode(
                        handle.read()
                    ).decode("utf-8")
            except OSError as error:
                print(f"Could not inline annotated image: {error}")

        return JSONResponse(content=payload)

    except HTTPException as http_error:
        return JSONResponse(
            status_code=http_error.status_code,
            content={"success": False, "error": http_error.detail},
        )

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Pothole detection failed: {e}"},
        )

    finally:
        discard(image_path)
