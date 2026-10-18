import { ControlPage } from "@/components/control/page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ControlPage resource="audit-logs" searchParams={searchParams} />;
}
