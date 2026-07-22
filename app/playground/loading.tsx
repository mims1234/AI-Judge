import { PageLoadMotion } from "@/components/ui/PageLoadMotion";

export default function PlaygroundLoading() {
  return (
    <PageLoadMotion
      titleWidth="w-48"
      rows={6}
      label="Loading playground"
    />
  );
}
