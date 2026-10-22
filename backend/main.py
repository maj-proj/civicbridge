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

from schema import GarbageResponse

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

# Home route
@app.get("/")
def home():
    return {
        "message": "Garbage Detection API is Running"
    }

# Prediction route
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