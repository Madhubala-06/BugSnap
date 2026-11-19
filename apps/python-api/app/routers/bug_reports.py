from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.bug_report_service import BugReportService

router = APIRouter(prefix="/bugs", tags=["bug_reports"])


class BugReportCreate(BaseModel):
    title: str
    description: Optional[str] = None
    steps_to_reproduce: Optional[List[str]] = None
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    severity: str = "medium"
    url: Optional[str] = None
    session_id: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    assigned_to_team_id: Optional[str] = None
    browser_info: Optional[dict] = None


class BugReportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    steps_to_reproduce: Optional[List[str]] = None
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    assigned_to_team_id: Optional[str] = None


class AIAnalysisUpdate(BaseModel):
    ai_summary: Optional[str] = None
    ai_root_cause: Optional[str] = None
    ai_suggestions: Optional[List[str]] = None


class BugReportResponse(BaseModel):
    id: str
    workspace_id: str
    reporter_id: str
    title: str
    description: Optional[str]
    steps_to_reproduce: Optional[List[str]]
    expected_result: Optional[str]
    actual_result: Optional[str]
    severity: str
    status: str
    url: Optional[str]
    session_id: Optional[str]
    assigned_to_user_id: Optional[str]
    assigned_to_team_id: Optional[str]
    browser_info: Optional[dict]
    ai_summary: Optional[str]
    ai_root_cause: Optional[str]
    ai_suggestions: Optional[List[str]]
    created_at: str
    updated_at: str


class StatsResponse(BaseModel):
    total: int
    by_status: dict
    by_severity: dict


@router.post("/", response_model=BugReportResponse)
async def create_bug_report(
    bug: BugReportCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Create a new bug report"""
    if bug.severity not in ["low", "medium", "high", "critical"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid severity. Must be 'low', 'medium', 'high', or 'critical'"
        )

    bug_service = BugReportService(db)
    report = await bug_service.create(
        workspace_id=current_user["workspace_id"],
        reporter_id=current_user["sub"],
        title=bug.title,
        description=bug.description,
        steps_to_reproduce=bug.steps_to_reproduce,
        expected_result=bug.expected_result,
        actual_result=bug.actual_result,
        severity=bug.severity,
        url=bug.url,
        session_id=bug.session_id,
        assigned_to_user_id=bug.assigned_to_user_id,
        assigned_to_team_id=bug.assigned_to_team_id,
        browser_info=bug.browser_info
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create bug report"
        )

    return report


@router.get("/", response_model=List[BugReportResponse])
async def list_bug_reports(
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = None,
    assigned_to_user_id: Optional[str] = None,
    assigned_to_team_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """List bug reports with filters"""
    bug_service = BugReportService(db)
    reports = await bug_service.get_by_workspace(
        workspace_id=current_user["workspace_id"],
        status=status_filter,
        severity=severity,
        assigned_to_user_id=assigned_to_user_id,
        assigned_to_team_id=assigned_to_team_id,
        limit=limit,
        offset=offset
    )
    return reports


@router.get("/my-reports", response_model=List[BugReportResponse])
async def get_my_reports(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get bug reports created by current user"""
    bug_service = BugReportService(db)
    reports = await bug_service.get_my_reports(current_user["sub"], limit)
    return reports


@router.get("/assigned-to-me", response_model=List[BugReportResponse])
async def get_assigned_to_me(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get bug reports assigned to current user"""
    bug_service = BugReportService(db)
    reports = await bug_service.get_assigned_to_me(current_user["sub"], limit)
    return reports


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get bug report statistics"""
    bug_service = BugReportService(db)
    stats = await bug_service.get_stats(current_user["workspace_id"])
    return stats


@router.get("/{report_id}", response_model=BugReportResponse)
async def get_bug_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get bug report by ID"""
    bug_service = BugReportService(db)
    report = await bug_service.get_with_details(report_id)

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bug report not found"
        )

    if report["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bug report is not in your workspace"
        )

    return report


@router.put("/{report_id}", response_model=BugReportResponse)
async def update_bug_report(
    report_id: str,
    update: BugReportUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Update bug report"""
    bug_service = BugReportService(db)
    report = await bug_service.get_by_id(report_id)

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bug report not found"
        )

    if report["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bug report is not in your workspace"
        )

    if update.severity and update.severity not in ["low", "medium", "high", "critical"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid severity"
        )

    if update.status and update.status not in ["open", "in_progress", "resolved", "closed", "wont_fix"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status"
        )

    updated = await bug_service.update(
        report_id=report_id,
        title=update.title,
        description=update.description,
        steps_to_reproduce=update.steps_to_reproduce,
        expected_result=update.expected_result,
        actual_result=update.actual_result,
        severity=update.severity,
        status=update.status,
        assigned_to_user_id=update.assigned_to_user_id,
        assigned_to_team_id=update.assigned_to_team_id
    )

    return updated


@router.put("/{report_id}/ai-analysis", response_model=BugReportResponse)
async def update_ai_analysis(
    report_id: str,
    analysis: AIAnalysisUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Update AI analysis for bug report"""
    bug_service = BugReportService(db)
    report = await bug_service.get_by_id(report_id)

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bug report not found"
        )

    if report["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bug report is not in your workspace"
        )

    updated = await bug_service.update_ai_analysis(
        report_id=report_id,
        ai_summary=analysis.ai_summary,
        ai_root_cause=analysis.ai_root_cause,
        ai_suggestions=analysis.ai_suggestions
    )

    return updated


@router.delete("/{report_id}")
async def delete_bug_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Delete bug report"""
    bug_service = BugReportService(db)
    report = await bug_service.get_by_id(report_id)

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bug report not found"
        )

    if report["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bug report is not in your workspace"
        )

    await bug_service.delete(report_id)
    return {"success": True}
