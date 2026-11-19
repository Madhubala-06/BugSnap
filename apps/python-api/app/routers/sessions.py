from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.session_service import SessionService

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    metadata: Optional[dict] = None


class SessionUpdate(BaseModel):
    status: Optional[str] = None
    metadata: Optional[dict] = None


class RecordingCreate(BaseModel):
    url: Optional[str] = None
    duration: Optional[int] = None
    size: Optional[int] = None
    thumbnail_url: Optional[str] = None


class LogEntry(BaseModel):
    type: str = "console"
    level: str = "info"
    message: str
    data: Optional[dict] = None


class LogBatch(BaseModel):
    logs: List[LogEntry]


class SessionResponse(BaseModel):
    id: str
    user_id: str
    status: str
    metadata: Optional[dict]
    created_at: str
    updated_at: str


class RecordingResponse(BaseModel):
    id: str
    session_id: str
    url: Optional[str]
    duration: Optional[int]
    size: Optional[int]
    thumbnail_url: Optional[str]
    created_at: str


class LogResponse(BaseModel):
    id: str
    session_id: str
    type: str
    level: str
    message: str
    data: Optional[dict]
    timestamp: str


@router.post("/", response_model=SessionResponse)
async def create_session(
    session: SessionCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Start a new recording session"""
    session_service = SessionService(db)
    new_session = await session_service.create(
        user_id=current_user["sub"],
        metadata=session.metadata
    )

    if not new_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create session"
        )

    return new_session


@router.get("/", response_model=List[SessionResponse])
async def list_sessions(
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """List user's sessions"""
    session_service = SessionService(db)
    sessions = await session_service.get_by_user(current_user["sub"], limit)
    return sessions


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get session by ID"""
    session_service = SessionService(db)
    session = await session_service.get_by_id(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    if session["user_id"] != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your session"
        )

    return session


@router.get("/{session_id}/details")
async def get_session_details(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get session with recording and logs"""
    session_service = SessionService(db)
    session = await session_service.get_with_details(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    if session["user_id"] != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your session"
        )

    return session


@router.put("/{session_id}/status")
async def update_session_status(
    session_id: str,
    status_value: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Update session status"""
    if status_value not in ["recording", "completed", "failed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status. Must be 'recording', 'completed', or 'failed'"
        )

    session_service = SessionService(db)
    session = await session_service.get_by_id(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    if session["user_id"] != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your session"
        )

    updated = await session_service.update_status(session_id, status_value)
    return updated


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Delete session"""
    session_service = SessionService(db)
    session = await session_service.get_by_id(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    if session["user_id"] != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your session"
        )

    await session_service.delete(session_id)
    return {"success": True}


# Recording endpoints
@router.post("/{session_id}/recording", response_model=RecordingResponse)
async def create_recording(
    session_id: str,
    recording: RecordingCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Create recording for session"""
    session_service = SessionService(db)
    session = await session_service.get_by_id(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    if session["user_id"] != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your session"
        )

    rec = await session_service.create_recording(
        session_id=session_id,
        url=recording.url,
        duration=recording.duration,
        size=recording.size,
        thumbnail_url=recording.thumbnail_url
    )

    return rec


@router.put("/{session_id}/recording", response_model=RecordingResponse)
async def update_recording(
    session_id: str,
    recording: RecordingCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Update recording for session"""
    session_service = SessionService(db)
    session = await session_service.get_by_id(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    if session["user_id"] != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your session"
        )

    rec = await session_service.update_recording(
        session_id=session_id,
        url=recording.url,
        duration=recording.duration,
        size=recording.size,
        thumbnail_url=recording.thumbnail_url
    )

    return rec


# Log endpoints
@router.post("/{session_id}/logs", response_model=LogResponse)
async def add_log(
    session_id: str,
    log: LogEntry,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Add log entry to session"""
    session_service = SessionService(db)
    session = await session_service.get_by_id(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    if session["user_id"] != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your session"
        )

    entry = await session_service.add_log(
        session_id=session_id,
        log_type=log.type,
        level=log.level,
        message=log.message,
        data=log.data
    )

    return entry


@router.post("/{session_id}/logs/batch", response_model=List[LogResponse])
async def add_logs_batch(
    session_id: str,
    batch: LogBatch,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Add multiple log entries at once"""
    session_service = SessionService(db)
    session = await session_service.get_by_id(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    if session["user_id"] != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your session"
        )

    logs = [log.model_dump() for log in batch.logs]
    entries = await session_service.add_logs_batch(session_id, logs)

    return entries


@router.get("/{session_id}/logs", response_model=List[LogResponse])
async def get_logs(
    session_id: str,
    type_filter: Optional[str] = None,
    level: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get logs for session"""
    session_service = SessionService(db)
    session = await session_service.get_by_id(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    if session["user_id"] != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your session"
        )

    logs = await session_service.get_logs(
        session_id=session_id,
        log_type=type_filter,
        level=level
    )

    return logs
