from typing import Any, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


# -----------------------------------------------
# Garbage Detection Schema (/predict/garbage)
# -----------------------------------------------
class GarbageImageAnalysis(BaseModel):
    total_objects_detected: int | None = None
    total_categories_detected: int | None = None
    percentage_basis: Literal["object_count"] = "object_count"
    
    
class GarbageDetectionInfo(BaseModel):
    garbage_class: str = Field(alias="class")
    confidence: float | None = None
    category: str | None = None
    
    
class CategoryInfo(BaseModel):
    category: str | None = None
    object_count: int | None = None
    percentage: float | None = None
    

class GarbageResponse(BaseModel):
    success: bool
    image_analysis: GarbageImageAnalysis
    detections: list[GarbageDetectionInfo]
    category_distribution: list[CategoryInfo]
    
    
# -----------------------------------------------
# Pothhole Detection Schema (/predict/garbage)
# -----------------------------------------------
class PotholeImageAnalysis(BaseModel):
    total_objects_detected: int = 0
    issue_detected: bool = False


class BoundaryCoordinates(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class PotholeDetectionInfo(BaseModel):
    id: int
    pothole_class: str = Field(alias="class")
    confidence: float
    severity_score: float
    severity_level: Literal["Low", "Medium", "High"]
    bounding_box: BoundaryCoordinates


class PotholeResponse(BaseModel):
    success: bool
    issue_type: str = "pothole"
    image_analysis: PotholeImageAnalysis
    detections: list[PotholeDetectionInfo]
    annotated_image: str | None = None
    model_config = ConfigDict(populate_by_name=True)