export type AccountSession = {
  id: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  aal: string | null;
  is_current: boolean;
  revoked_at: string | null;
};
export type AccountSessionPage = {
  rows: AccountSession[];
  total: number;
  page: number;
  page_size: number;
};
