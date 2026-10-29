from typing import Any, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

class ImageAnalysis(BaseModel):
    total_objects_detected: int | None = None
    total_categories_detected: int | None = None
    percentage_basis: Literal["object_count"] = "object_count"
    
    
class DetectionInfo(BaseModel):
    garbage_class: str = Field(alias="class")
    confidence: float | None = None
    category: str | None = None
    
    
class CategoryInfo(BaseModel):
    category: str | None = None
    object_count: int | None = None
    percentage: float | None = None
    

class GarbageResponse(BaseModel):
    success: bool
    image_analysis: ImageAnalysis
    detections: list[DetectionInfo]
    category_distribution: list[CategoryInfo]