from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models import BugReport, User, Team


class BugReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        workspace_id: str,
        reporter_id: str,
        title: str,
        description: Optional[str] = None,
        steps_to_reproduce: List[str] = None,
        expected_result: Optional[str] = None,
        actual_result: Optional[str] = None,
        severity: str = "medium",
        url: Optional[str] = None,
        session_id: Optional[str] = None,
        assigned_to_user_id: Optional[str] = None,
        assigned_to_team_id: Optional[str] = None,
        browser_info: Optional[dict] = None
    ) -> BugReport:
        bug = BugReport(
            workspace_id=workspace_id,
            reporter_id=reporter_id,
            title=title,
            description=description,
            steps_to_reproduce=steps_to_reproduce or [],
            expected_result=expected_result,
            actual_result=actual_result,
            severity=severity,
            status="open",
            url=url,
            session_id=session_id,
            assigned_to_user_id=assigned_to_user_id,
            assigned_to_team_id=assigned_to_team_id,
            browser_info=browser_info
        )
        self.db.add(bug)
        await self.db.commit()
        await self.db.refresh(bug)
        return bug

    async def get_by_id(self, report_id: str) -> Optional[BugReport]:
        result = await self.db.execute(select(BugReport).where(BugReport.id == report_id))
        return result.scalar_one_or_none()

    async def get_with_details(self, report_id: str) -> Optional[BugReport]:
        result = await self.db.execute(
            select(BugReport)
            .options(
                selectinload(BugReport.reporter),
                selectinload(BugReport.assigned_user),
                selectinload(BugReport.assigned_team)
            )
            .where(BugReport.id == report_id)
        )
        return result.scalar_one_or_none()

    async def get_by_workspace(
        self,
        workspace_id: str,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        assigned_to_user_id: Optional[str] = None,
        assigned_to_team_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[BugReport]:
        query = select(BugReport).options(
            selectinload(BugReport.reporter),
            selectinload(BugReport.assigned_user),
            selectinload(BugReport.assigned_team)
        ).where(BugReport.workspace_id == workspace_id)

        if status:
            query = query.where(BugReport.status == status)
        if severity:
            query = query.where(BugReport.severity == severity)
        if assigned_to_user_id:
            query = query.where(BugReport.assigned_to_user_id == assigned_to_user_id)
        if assigned_to_team_id:
            query = query.where(BugReport.assigned_to_team_id == assigned_to_team_id)

        query = query.order_by(BugReport.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_my_reports(self, user_id: str, limit: int = 50) -> List[BugReport]:
        result = await self.db.execute(
            select(BugReport)
            .where(BugReport.reporter_id == user_id)
            .order_by(BugReport.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_assigned_to_me(self, user_id: str, limit: int = 50) -> List[BugReport]:
        result = await self.db.execute(
            select(BugReport)
            .options(selectinload(BugReport.reporter))
            .where(BugReport.assigned_to_user_id == user_id)
            .order_by(BugReport.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_assigned_to_team(self, team_id: str, limit: int = 50) -> List[BugReport]:
        result = await self.db.execute(
            select(BugReport)
            .options(selectinload(BugReport.reporter))
            .where(BugReport.assigned_to_team_id == team_id)
            .order_by(BugReport.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update(
        self,
        report_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        steps_to_reproduce: Optional[List[str]] = None,
        expected_result: Optional[str] = None,
        actual_result: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        assigned_to_user_id: Optional[str] = None,
        assigned_to_team_id: Optional[str] = None
    ) -> Optional[BugReport]:
        bug = await self.get_by_id(report_id)
        if not bug:
            return None

        if title is not None:
            bug.title = title
        if description is not None:
            bug.description = description
        if steps_to_reproduce is not None:
            bug.steps_to_reproduce = steps_to_reproduce
        if expected_result is not None:
            bug.expected_result = expected_result
        if actual_result is not None:
            bug.actual_result = actual_result
        if severity is not None:
            bug.severity = severity
        if status is not None:
            bug.status = status
        if assigned_to_user_id is not None:
            bug.assigned_to_user_id = assigned_to_user_id if assigned_to_user_id else None
        if assigned_to_team_id is not None:
            bug.assigned_to_team_id = assigned_to_team_id if assigned_to_team_id else None

        await self.db.commit()
        await self.db.refresh(bug)
        return bug

    async def update_ai_analysis(
        self,
        report_id: str,
        ai_summary: Optional[str] = None,
        ai_root_cause: Optional[str] = None,
        ai_suggestions: Optional[List[str]] = None
    ) -> Optional[BugReport]:
        bug = await self.get_by_id(report_id)
        if not bug:
            return None

        if ai_summary is not None:
            bug.ai_summary = ai_summary
        if ai_root_cause is not None:
            bug.ai_root_cause = ai_root_cause
        if ai_suggestions is not None:
            bug.ai_suggestions = ai_suggestions

        await self.db.commit()
        await self.db.refresh(bug)
        return bug

    async def delete(self, report_id: str) -> bool:
        bug = await self.get_by_id(report_id)
        if bug:
            await self.db.delete(bug)
            await self.db.commit()
            return True
        return False

    async def get_stats(self, workspace_id: str) -> dict:
        result = await self.db.execute(
            select(BugReport.status, BugReport.severity)
            .where(BugReport.workspace_id == workspace_id)
        )
        reports = result.all()

        stats = {
            "total": len(reports),
            "by_status": {"open": 0, "in_progress": 0, "resolved": 0, "closed": 0, "wont_fix": 0},
            "by_severity": {"low": 0, "medium": 0, "high": 0, "critical": 0}
        }

        for status, severity in reports:
            if status in stats["by_status"]:
                stats["by_status"][status] += 1
            if severity in stats["by_severity"]:
                stats["by_severity"][severity] += 1

        return stats
