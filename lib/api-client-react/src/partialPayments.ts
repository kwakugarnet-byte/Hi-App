import { useMutation, useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface PartialPayment {
  id: number;
  customerName: string;
  waitressName: string;
  amountPence: number;
  recordedBy: string;
  createdAt: string;
}

export interface RecordPartialPaymentBody {
  customerName: string;
  waitressName: string;
  amountPence: number;
}

export const getPartialPaymentsQueryKey = (customerName?: string, waitressName?: string) =>
  [`/api/partial-payments`, customerName, waitressName] as const;

export const getPartialPayments = async (
  customerName?: string,
  waitressName?: string,
): Promise<PartialPayment[]> => {
  const params = new URLSearchParams();
  if (customerName) params.set("customerName", customerName);
  if (waitressName) params.set("waitressName", waitressName);
  const qs = params.toString();
  return customFetch<PartialPayment[]>(`/api/partial-payments${qs ? `?${qs}` : ""}`);
};

export const useGetPartialPayments = (customerName?: string, waitressName?: string) =>
  useQuery({
    queryKey: getPartialPaymentsQueryKey(customerName, waitressName),
    queryFn: () => getPartialPayments(customerName, waitressName),
    refetchInterval: 15000,
  });

export const recordPartialPayment = async (data: RecordPartialPaymentBody): Promise<PartialPayment> =>
  customFetch<PartialPayment>("/api/partial-payments", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const useRecordPartialPayment = () =>
  useMutation({
    mutationFn: recordPartialPayment,
  });
