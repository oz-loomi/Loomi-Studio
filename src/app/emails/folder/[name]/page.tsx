import { redirect } from 'next/navigation';

export default async function EmailsFolderRedirect({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  redirect(`/templates/folder/${encodeURIComponent(name)}`);
}
