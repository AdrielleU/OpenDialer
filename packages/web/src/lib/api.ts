import type { Campaign, Contact, Recording, DialerStatus, CallTranscript } from '../types';

const BASE = '/api';

interface CampaignStats {
  campaign: { id: number; name: string; status: string };
  contacts: {
    total: number;
    pending: number;
    completed: number;
    breakdown: Record<string, number>;
  };
  calls: {
    total: number;
    totalDurationSeconds: number;
    avgDurationSeconds: number;
    humanTakeovers: number;
    breakdown: Record<string, number>;
  };
}

async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// Auth
export const auth = {
  status: () =>
    request<{ hasPassword: boolean; hasMfa: boolean; hasWorkos: boolean; loggedIn: boolean }>(
      '/auth/status',
    ),
  login: (password: string) =>
    request<{ requireMfa: boolean; message?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  loginMfa: (password: string, code: string) =>
    request<{ message: string }>('/auth/login/mfa', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

// Campaigns
export const api = {
  campaigns: {
    list: () => request<(Campaign & { contactCount: number })[]>('/campaigns'),
    get: (id: number) => request<Campaign>(`/campaigns/${id}`),
    create: (data: { name: string; callerId: string; openerRecordingId?: number; voicemailRecordingId?: number }) =>
      request<Campaign>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Campaign>) =>
      request<Campaign>(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request(`/campaigns/${id}`, { method: 'DELETE' }),
  },

  contacts: {
    list: (campaignId?: number) =>
      request<Contact[]>(campaignId ? `/contacts?campaignId=${campaignId}` : '/contacts'),
    get: (id: number) => request<Contact>(`/contacts/${id}`),
    create: (data: { campaignId: number; name?: string; phone: string; company?: string; email?: string; notes?: string }) =>
      request<Contact>('/contacts', { method: 'POST', body: JSON.stringify(data) }),
    bulkImport: (campaignId: number, contacts: Array<{ name?: string; phone: string; company?: string; email?: string; notes?: string }>) =>
      request<{ imported: number }>('/contacts/bulk', { method: 'POST', body: JSON.stringify({ campaignId, contacts }) }),
    update: (id: number, data: Partial<Contact>) =>
      request<Contact>(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request(`/contacts/${id}`, { method: 'DELETE' }),
  },

  recordings: {
    list: (type?: string) => request<Recording[]>(type ? `/recordings?type=${type}` : '/recordings'),
    upload: async (file: File, name: string, type: 'opener' | 'voicemail'): Promise<Recording> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);
      formData.append('type', type);
      const res = await fetch(`${BASE}/recordings`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    delete: (id: number) => request(`/recordings/${id}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => request<Record<string, string>>('/settings'),
    update: (data: Record<string, string>) =>
      request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
    health: () => request<{ status: string; message: string }>('/settings/health'),
  },

  analytics: {
    campaignStats: (campaignId: number) => request<CampaignStats>(`/analytics/campaigns/${campaignId}/stats`),
    exportContacts: (campaignId: number) => downloadFile(`/analytics/campaigns/${campaignId}/export/contacts`, `contacts-campaign-${campaignId}.csv`),
    exportCallLogs: (campaignId: number) => downloadFile(`/analytics/campaigns/${campaignId}/export/calls`, `call-logs-campaign-${campaignId}.csv`),
    exportSummary: () => downloadFile('/analytics/export/summary', 'campaigns-summary.csv'),
  },

  transcripts: {
    byCampaign: (campaignId: number) =>
      request<CallTranscript[]>(`/transcripts/campaign/${campaignId}`),
    byCallLog: (callLogId: number) =>
      request<CallTranscript[]>(`/transcripts?callLogId=${callLogId}`),
  },

  dialer: {
    start: (campaignId: number) =>
      request('/dialer/start', { method: 'POST', body: JSON.stringify({ campaignId }) }),
    pause: () => request('/dialer/pause', { method: 'POST' }),
    resume: () => request('/dialer/resume', { method: 'POST' }),
    stop: () => request('/dialer/stop', { method: 'POST' }),
    skip: () => request('/dialer/skip', { method: 'POST' }),
    jumpIn: () => request('/dialer/jump-in', { method: 'POST' }),
    status: () => request<DialerStatus>('/dialer/status'),
  },
};
