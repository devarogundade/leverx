import type { AppAuthPayload, AppAuthResponse } from '../auth/app-auth.types';

export type CreateManagerBody = AppAuthPayload;

export type ManagerResponse = {
  address: string;
  manager_id: string | null;
  created?: boolean;
  auth?: AppAuthResponse;
};

export type UserManagerRecord = {
  user_address: string;
  manager_id: string;
  created_at_ms: number;
};
