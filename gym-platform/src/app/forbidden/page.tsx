import { LinkButton } from "@/components/ui";

export default function Forbidden() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">You don&apos;t have access to that page</h1>
      <p className="mt-2 text-muted">Ask the gym owner to change your role if you need it.</p>
      <LinkButton href="/login" className="mt-6">Switch account</LinkButton>
    </main>
  );
}
