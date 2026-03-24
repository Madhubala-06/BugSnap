export interface BugReport {
  id: string;
  sessionId: string;
  title: string;
  steps: string[];
  expectedResult: string;
  actualResult: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  aiAnalysis?: string;
  createdAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  videoUrl?: string;
  logs: SessionLog[];
  createdAt: Date;
}

export interface SessionLog {
  id: string;
  sessionId: string;
  type: 'console' | 'network' | 'click';
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface User {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
  createdAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: Date;
}
