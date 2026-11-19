from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Session, Recording, SessionLog


class SessionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, user_id: str, metadata: Optional[dict] = None) -> Session:
        session = Session(
            user_id=user_id,
            status="recording",
            metadata=metadata
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def get_by_id(self, session_id: str) -> Optional[Session]:
        result = await self.db.execute(select(Session).where(Session.id == session_id))
        return result.scalar_one_or_none()

    async def get_with_details(self, session_id: str) -> Optional[dict]:
        result = await self.db.execute(
            select(Session)
            .options(selectinload(Session.recording), selectinload(Session.logs))
            .where(Session.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            return None

        return {
            **{k: v for k, v in session.__dict__.items() if not k.startswith('_')},
            "recording": session.recording,
            "logs": session.logs
        }

    async def get_by_user(self, user_id: str, limit: int = 20) -> List[Session]:
        result = await self.db.execute(
            select(Session)
            .options(selectinload(Session.recording))
            .where(Session.user_id == user_id)
            .order_by(Session.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update_status(self, session_id: str, status: str) -> Optional[Session]:
        session = await self.get_by_id(session_id)
        if not session:
            return None

        session.status = status
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def update_metadata(self, session_id: str, metadata: dict) -> Optional[Session]:
        session = await self.get_by_id(session_id)
        if not session:
            return None

        session.metadata = metadata
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def delete(self, session_id: str) -> bool:
        session = await self.get_by_id(session_id)
        if session:
            await self.db.delete(session)
            await self.db.commit()
            return True
        return False

    async def create_recording(
        self,
        session_id: str,
        url: Optional[str] = None,
        duration: Optional[int] = None,
        size: Optional[int] = None,
        thumbnail_url: Optional[str] = None
    ) -> Recording:
        recording = Recording(
            session_id=session_id,
            url=url,
            duration=duration,
            size=size,
            thumbnail_url=thumbnail_url
        )
        self.db.add(recording)
        await self.db.commit()
        await self.db.refresh(recording)
        return recording

    async def update_recording(
        self,
        session_id: str,
        url: Optional[str] = None,
        duration: Optional[int] = None,
        size: Optional[int] = None,
        thumbnail_url: Optional[str] = None
    ) -> Optional[Recording]:
        result = await self.db.execute(
            select(Recording).where(Recording.session_id == session_id)
        )
        recording = result.scalar_one_or_none()
        if not recording:
            return None

        if url is not None:
            recording.url = url
        if duration is not None:
            recording.duration = duration
        if size is not None:
            recording.size = size
        if thumbnail_url is not None:
            recording.thumbnail_url = thumbnail_url

        await self.db.commit()
        await self.db.refresh(recording)
        return recording

    async def add_log(
        self,
        session_id: str,
        log_type: str,
        message: str,
        level: str = "info",
        data: Optional[dict] = None
    ) -> SessionLog:
        log = SessionLog(
            session_id=session_id,
            type=log_type,
            level=level,
            message=message,
            data=data
        )
        self.db.add(log)
        await self.db.commit()
        await self.db.refresh(log)
        return log

    async def add_logs_batch(self, session_id: str, logs: List[dict]) -> List[SessionLog]:
        log_entries = []
        for log in logs:
            entry = SessionLog(
                session_id=session_id,
                type=log.get("type", "console"),
                level=log.get("level", "info"),
                message=log.get("message", ""),
                data=log.get("data")
            )
            self.db.add(entry)
            log_entries.append(entry)

        await self.db.commit()
        for entry in log_entries:
            await self.db.refresh(entry)
        return log_entries

    async def get_logs(
        self,
        session_id: str,
        log_type: Optional[str] = None,
        level: Optional[str] = None
    ) -> List[SessionLog]:
        query = select(SessionLog).where(SessionLog.session_id == session_id)

        if log_type:
            query = query.where(SessionLog.type == log_type)
        if level:
            query = query.where(SessionLog.level == level)

        result = await self.db.execute(query.order_by(SessionLog.timestamp))
        return list(result.scalars().all())
