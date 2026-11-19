from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class SessionStatus(str, Enum):
    RECORDING = "recording"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class LogType(str, Enum):
    CONSOLE = "console"
    NETWORK = "network"
    CLICK = "click"
    ERROR = "error"
    NAVIGATION = "navigation"
    INPUT = "input"


class LogLevel(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"


class SessionLogCreate(BaseModel):
    type: LogType
    level: LogLevel = LogLevel.INFO
    message: str
    data: Optional[dict] = None


class SessionLogResponse(SessionLogCreate):
    id: str
    session_id: str
    timestamp: datetime

    class Config:
        from_attributes = True


class RecordingResponse(BaseModel):
    id: str
    session_id: str
    url: Optional[str] = None
    duration: Optional[int] = None
    size: Optional[int] = None
    mime_type: str = "video/webm"
    thumbnail_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SessionCreate(BaseModel):
    metadata: Optional[dict] = None


class SessionUpdate(BaseModel):
    status: Optional[SessionStatus] = None
    metadata: Optional[dict] = None


class SessionResponse(BaseModel):
    id: str
    user_id: str
    status: SessionStatus
    metadata: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionWithDetails(SessionResponse):
    recording: Optional[RecordingResponse] = None
    logs: List[SessionLogResponse] = []
