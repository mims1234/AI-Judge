import { PageLoadMotion } from "@/components/ui/PageLoadMotion";

export default function CellLoading() {
  return <PageLoadMotion titleWidth="w-64" rows={4} label="Loading cell" />;
}
