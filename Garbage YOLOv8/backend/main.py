"""
CivicBridge — YOLOv8 garbage detection service.

Pure vision: this service classifies an image and reports what it saw.
It holds no database, no secrets, and makes no judgement about priority —
scoring, zone sensitivity, authority routing and email all live in the
Next.js app, so tuning the algorithm never means redeploying the model.

Contract: see README_API.md
"""

import os
import uuid

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from ultralytics import YOLO

from categories import resolve_category

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODEL_PATH = os.getenv("MODEL_PATH", "best.pt")
CONF_THRESHOLD = float(os.getenv("CONF_THRESHOLD", "0.25"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))  # 10MB
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
ANNOTATED_DIR = os.path.join(UPLOAD_DIR, "annotated")

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

app = FastAPI(title="CivicBridge Garbage Detection API", version="1.0.0")

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

model = YOLO(MODEL_PATH)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/")
def home():
    return {
        "message": "Garbage Detection API is Running",
        "model": MODEL_PATH,
        "classes": len(model.names),
    }


@app.get("/health")
def health():
    """Liveness probe. The frontend degrades gracefully when this fails."""
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "class_count": len(model.names),
        "conf_threshold": CONF_THRESHOLD,
    }


@app.get("/classes")
def classes():
    """
    The model's real class list and how each one maps to a waste category.
    Use this to verify the category weights in the frontend scorer.
    """
    return {
        "classes": [
            {"id": idx, "name": name, "category": resolve_category(name)}
            for idx, name in model.names.items()
        ]
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    image_path = None

    try:
        # --- validation -----------------------------------------------------
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

        with open(image_path, "wb") as buffer:
            buffer.write(contents)

        # Confirm it really is a decodable image, not just a correct header.
        try:
            with Image.open(image_path) as img:
                img.verify()
        except Exception:
            raise HTTPException(
                status_code=400, detail="File is not a readable image."
            )

        with Image.open(image_path) as img:
            image_width, image_height = img.size

        # --- inference ------------------------------------------------------
        results = model.predict(source=image_path, conf=CONF_THRESHOLD, verbose=False)

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

            if boxes is None:
                continue

            for box in boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0]) * 100.0
                class_name = model.names[class_id]
                category = resolve_category(class_name)

                total_objects += 1

                stat = class_stats.setdefault(
                    class_name,
                    {"class": class_name, "category": category, "confidence": 0.0, "count": 0},
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

            # Annotated overlay, saved once from the first result.
            if annotated_url is None:
                try:
                    plotted = result.plot()  # BGR ndarray
                    annotated_name = f"{file_id}_annotated.jpg"
                    annotated_path = os.path.join(ANNOTATED_DIR, annotated_name)
                    Image.fromarray(plotted[:, :, ::-1]).save(annotated_path, "JPEG")
                    annotated_url = f"/static/annotated/{annotated_name}"
                except Exception as plot_error:  # non-fatal
                    print(f"Could not render annotated image: {plot_error}")

        # --- category distribution -----------------------------------------
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

        total_area_ratio = round(float(coverage.sum()) / float(image_width * image_height), 4)

        return JSONResponse(
            content={
                "success": True,
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
            content={"success": False, "error": str(e)},
        )

    finally:
        # The source upload is transient — the frontend persists its own copy
        # to object storage. Only the annotated overlay is kept.
        if image_path and os.path.exists(image_path):
            try:
                os.remove(image_path)
            except OSError:
                pass
