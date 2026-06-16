export type CreateManagerBody = {
  address: string;
  expires_at_ms: number;
  message_bytes: string;
  signature: string;
};

export type ManagerResponse = {
  address: string;
  manager_id: string | null;
  created?: boolean;
};

export type UserManagerRecord = {
  user_address: string;
  manager_id: string;
  created_at_ms: number;
};
