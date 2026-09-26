import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { UsernameForm } from "./UsernameForm";

export default async function UsernamePage() {
  const user = await requireUser();
  if (user.username) {
    redirect("/");
  }
  return (
    <>
      <h1 className="h3">Choose your username</h1>
      <p>
        Your username is part of the path to your files. You cannot change it
        later.
      </p>
      <UsernameForm />
    </>
  );
}
