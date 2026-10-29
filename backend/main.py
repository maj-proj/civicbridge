from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
from collections import Counter
from PIL import Image
from pathlib import Path
import shutil
import uuid
import os
import base64
import cv2
from schema import GarbageResponse, PotholeResponse

# Initialize FastAPI app
app = FastAPI()

# Allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load trained YOLOv8 model
garbage_model = YOLO("best.pt")

pothole_model = YOLO("best_pothole.pt")

# Create folders
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

CATEGORY_MAPPING = {
    "battery": "Battery/E-waste",
    "can": "Metal",
    "cardboard": "Paper/Cardboard",
    "drink carton": "Paper/Cardboard",
    "glass bottle": "Glass",
    "paper": "Paper/Cardboard",
    "plastic bag": "Plastic",
    "plastic bottle": "Plastic",
    "plastic bottle cap": "Plastic",
    "pop tab": "Metal",
}


# ---------------------------------------------------
# Function for calculating severity of the pothole
# ---------------------------------------------------
def calculate_severity_score(
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    image_width: int,
    image_height: int
) -> dict:

    # 1. Calculate pothole bounding-box dimensions
    box_width = max(0, x2 - x1)
    box_height = max(0, y2 - y1)

    # 2. Calculate areas
    pothole_area = box_width * box_height
    image_area = image_width * image_height

    if image_area <= 0:
        raise ValueError("Image dimensions must be positive")

    # 3. Calculate relative area
    area_ratio = pothole_area / image_area

    # 4. Calculate severity score (0-100)
    severity_score = min(
        (area_ratio / 0.15) * 100,
        100.0
    )
    severity_score = round(severity_score, 2)

    # 5. Assign severity level
    if severity_score < 35:
        severity_level = "Low"
    elif severity_score < 70:
        severity_level = "Medium"
    else:
        severity_level = "High"

    return {
        "severity_score": severity_score,
        "severity_level": severity_level
    }


# ---------------------------------------------------
# Home Endpoint
# ---------------------------------------------------
@app.get("/")
def home():
    return {
        "message": "Garbage Detection API is Running"
    }


# ---------------------------------------------------
# Garbage Detection Endpoint
# ---------------------------------------------------
@app.post("/predict/garbage", response_model=GarbageResponse)
async def predict(file: UploadFile = File(...)):
    
    image_path = UPLOAD_DIR / f"{uuid.uuid4()}.jpg"

    try:
        image_bytes = await file.read()
        
        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty."
            )
            
        from io import BytesIO
        
        try:
            with Image.open(BytesIO(image_bytes)) as img:
                img.convert("RGB").save(image_path, format="JPEG")
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid image file"
            )

        # Run YOLO prediction
        results = garbage_model.predict(
            source=str(image_path),
            conf=0.15,
            imgsz=640,
            verbose=False
        )

        detections = []

        # Extract detections
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls.item())
                confidence = float(box.conf.item())

                class_name = result.names[class_id]
                category = CATEGORY_MAPPING.get(
                    class_name.strip().lower(),
                    "Other"
                )
                
                detections.append({
                    "class": class_name,
                    "confidence": round(confidence * 100, 2),
                    "category": category
                })
                
        category_counts = Counter(
            item["category"]
            for item in detections
        )
        
        total_objects = len(detections)

        category_distribution = [
            {
                "category": category,
                "object_count": count,
                "percentage": round(
                    count*100 / total_objects, 2
                ) if total_objects else 0.0
            }
            for category, count in sorted(category_counts.items())
        ]
        
        return {
            "success": True,
            "image_analysis": {
                "total_objects_detected": total_objects,
                "total_categories_detected": len(category_counts),
                "percentage_basis": "object_count"
            },
            "detections": detections,
            "category_distribution": category_distribution
        }
        
    except HTTPException:
        raise
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Garbage detection failed: {str(e)}"
        )
        
    finally:
        if image_path.exists():
            image_path.unlink()
            
            
# ---------------------------------------------------
# Pothole Detection Endpoint
# ---------------------------------------------------
@app.post("/detect/pothole", response_model=PotholeResponse)
async def predict_pothole(file: UploadFile = File(...)):

    image_path = UPLOAD_DIR / f"{uuid.uuid4()}.jpg"

    try:
        image_bytes = await file.read()

        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty."
            )

        from io import BytesIO

        # Validate and convert image to RGB
        try:
            with Image.open(BytesIO(image_bytes)) as img:
                rgb_image = img.convert("RGB")
                image_width, image_height = rgb_image.size
                rgb_image.save(image_path, format="JPEG")

        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid image file."
            )

        # Run pothole detection
        results = pothole_model.predict(
            source=str(image_path),
            conf=0.20,
            imgsz=640,
            verbose=False
        )

        detections = []

        # Extract bounding boxes, confidence and severity
        for result in results:
            for box in result.boxes:

                x1, y1, x2, y2 = map(
                    int, box.xyxy[0].tolist()
                )

                confidence = float(box.conf[0])

                class_id = int(box.cls[0])
                class_name = result.names[class_id]

                # Calculate estimated severity
                severity = calculate_severity_score(
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    image_width=image_width,
                    image_height=image_height
                )

                detections.append({
                    "id": len(detections) + 1,
                    "class": class_name,
                    "confidence": round(confidence * 100, 2),
                    "severity_score": severity["severity_score"],
                    "severity_level": severity["severity_level"],
                    "bounding_box": {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2
                    }
                })
                
        # Generate annotated image
        annotated_image = results[0].plot()

        # Encode image as JPEG
        success, buffer = cv2.imencode(
            ".jpg",
            annotated_image
        )

        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to encode annotated image."
            )

        # Convert JPEG bytes to Base64
        annotated_image_base64 = base64.b64encode(
            buffer.tobytes()
        ).decode("utf-8")

        total_objects = len(detections)

        return {
            "success": True,
            "issue_type": "pothole",
            "image_analysis": {
                "total_objects_detected": total_objects,
                "issue_detected": total_objects > 0
            },
            "detections": detections,
            "annotated_image": annotated_image_base64
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Pothole detection failed: {str(e)}"
        )

    finally:
        if image_path.exists():
            image_path.unlink()
