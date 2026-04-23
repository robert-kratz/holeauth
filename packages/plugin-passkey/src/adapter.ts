/** Adapter interface for passkey credentials. */
export interface PasskeyRecord {
  id: string;
  userId: string;
  credentialId: string; // base64url
  publicKey: string;    // base64url
  counter: number;
  transports?: string[] | null;
  deviceName?: string | null;
  createdAt?: Date;
}

export interface PasskeyAdapter {
  list(userId: string): Promise<PasskeyRecord[]>;
  getByCredentialId(credentialId: string): Promise<PasskeyRecord | null>;
  create(data: Omit<PasskeyRecord, 'id'>): Promise<PasskeyRecord>;
  updateCounter(credentialId: string, counter: number): Promise<void>;
  delete(id: string): Promise<void>;
}
