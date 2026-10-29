"""
Response shapes for the detection API.

These mirror what main.py returns. The routes build plain dicts and return
JSONResponse rather than binding these as response_model, because a Pydantic
model would silently drop any field it does not declare — and the garbage
contract deliberately carries additive fields (total_area_ratio, image
dimensions, per-class object_count) that the frontend scorer relies on.

They are kept as the written contract, and for anything that wants to
validate a payload.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Garbage — POST /predict/garbage (alias /predict)
# ---------------------------------------------------------------------------


class GarbageImageAnalysis(BaseModel):
    total_objects_detected: int = 0
    total_categories_detected: int = 0
    percentage_basis: Literal["object_count"] = "object_count"
    # Union of all detection boxes over the frame area. Object count alone
    # cannot distinguish 20 bottle caps from 20 dumped bags; this can.
    total_area_ratio: Optional[float] = None
    image_width: Optional[int] = None
    image_height: Optional[int] = None


class GarbageDetectionInfo(BaseModel):
    garbage_class: str = Field(alias="class")
    confidence: Optional[float] = None
    category: Optional[str] = None
    # Boxes of this class in the frame; detections carry one row per class.
    object_count: Optional[int] = None

    model_config = ConfigDict(populate_by_name=True)


class CategoryInfo(BaseModel):
    category: Optional[str] = None
    object_count: Optional[int] = None
    percentage: Optional[float] = None


class GarbageResponse(BaseModel):
    success: bool
    issue_type: Literal["garbage"] = "garbage"
    image_analysis: GarbageImageAnalysis
    detections: list[GarbageDetectionInfo]
    category_distribution: list[CategoryInfo]
    # Served by this API under /static; the frontend mirrors it to object
    # storage so it survives outside this host.
    annotated_image_url: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


# ---------------------------------------------------------------------------
# Pothole — POST /predict/pothole (alias /detect/pothole)
# ---------------------------------------------------------------------------


class PotholeImageAnalysis(BaseModel):
    total_objects_detected: int = 0
    issue_detected: bool = False
    total_area_ratio: Optional[float] = None
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    worst_severity_score: Optional[float] = None
    worst_severity_level: Optional[Literal["Low", "Medium", "High"]] = None


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

    model_config = ConfigDict(populate_by_name=True)


class PotholeResponse(BaseModel):
    success: bool
    issue_type: Literal["pothole"] = "pothole"
    image_analysis: PotholeImageAnalysis
    detections: list[PotholeDetectionInfo]
    annotated_image_url: Optional[str] = None
    # Only populated when ?include_base64=true.
    annotated_image: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ErrorResponse(BaseModel):
    success: Literal[False] = False
    error: str
