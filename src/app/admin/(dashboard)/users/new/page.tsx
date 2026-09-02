import Link from "next/link";
import { db } from "@/lib/db";
import { createUser } from "../actions";
import { Button, Card, Input, Select } from "@/components/ui";

export default async function NewUser() {
  const roles = await db.role.findMany({ orderBy: { key: "asc" } });

  return (
    <>
      <h1>کاربر جدید</h1>
      <Card className="mt-4 max-w-lg">
        <form action={createUser} className="grid gap-4">
          <label className="grid gap-1">
            ایمیل
            <Input type="email" name="email" required />
          </label>
          <label className="grid gap-1">
            نام
            <Input name="name" required />
          </label>
          <label className="grid gap-1">
            رمز عبور (حداقل ۸ نویسه)
            <Input type="password" name="password" minLength={8} required />
          </label>
          <label className="grid gap-1">
            نقش
            <Select name="roleKey" required defaultValue="admin">
              {roles.map((r) => (
                <option key={r.id} value={r.key}>
                  {r.key}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit">ساخت کاربر</Button>
            <Link href="/admin/users">انصراف</Link>
          </div>
        </form>
      </Card>
    </>
  );
}
