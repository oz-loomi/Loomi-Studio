import { redirect } from 'next/navigation';

export default function EmailsFolderRedirect({
  params,
}: {
  params: { name: string };
}) {
  redirect(`/templates/folder/${encodeURIComponent(params.name)}`);
}
