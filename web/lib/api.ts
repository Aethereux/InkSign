export type ApiError = { error: string; message: string };

export type CreatedDoc = {
  id: string;
  title: string;
  pageCount: number;
  requesterToken: string;
  requesterUrl: string;
  signers: { email: string; orderIdx: number; signUrl: string }[];
};

export type DashboardSigner = {
  email: string;
  name: string | null;
  orderIdx: number;
  status: "pending" | "signed";
  signedAt: string | null;
  signUrl: string;
};

export type Dashboard = {
  id: string;
  title: string;
  filename: string;
  requesterEmail: string;
  status: "pending" | "completed";
  pageCount: number;
  latestVersion: number;
  hasSignedVersion: boolean;
  createdAt: string;
  completedAt: string | null;
  signers: DashboardSigner[];
};

export type SignerView = {
  docTitle: string;
  filename: string;
  pageCount: number;
  docStatus: "pending" | "completed";
  yourStatus: "pending" | "signed";
  yourTurn: boolean;
  waitingOn: string | null;
  position: { index: number; total: number };
  remainingSigners: number;
  signedAt: string | null;
};

export class RequestFailed extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestFailed(
      res.status,
      body?.error ?? "network_error",
      body?.message ?? "We couldn't reach the server. Nothing was lost — try again.",
    );
  }
  return res.json() as Promise<T>;
}

export const createDocument = (form: FormData) =>
  request<CreatedDoc>("/api/documents", { method: "POST", body: form });

export const getDashboard = (token: string) => request<Dashboard>(`/api/docs/${token}`);

export const getSignerView = (token: string) => request<SignerView>(`/api/sign/${token}`);

export const submitSignature = (
  token: string,
  payload: {
    name: string;
    signaturePng: string;
    printedName: "under" | "none";
    placement: { page: number; x: number; y: number; w: number };
  },
) =>
  request<{ status: string; docStatus: string; signedAt: string }>(`/api/sign/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
