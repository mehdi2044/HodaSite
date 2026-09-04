"use client";

import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Dialog,
  Input,
  Select,
  Sheet,
  TD,
  TH,
  Table,
  ToastProvider,
  useToast,
} from "@/components/ui";

function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => toast("ذخیره شد", "success")}>
        Toast موفق
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => toast("خطا در ذخیره", "error")}
      >
        Toast خطا
      </Button>
    </div>
  );
}

export default function Design() {
  return (
    <ToastProvider>
      <h1>سیستم طراحی</h1>
      <p className="text-muted">
        اجزای پایه از <code>src/components/ui</code> روی Tailwind + توکن‌های تم.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>Button</CardTitle>
          <CardDescription>چهار حالت، دو اندازه</CardDescription>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button>اصلی</Button>
            <Button variant="secondary">ثانویه</Button>
            <Button variant="ghost">شفاف</Button>
            <Button variant="destructive">حذف</Button>
            <Button size="sm">کوچک</Button>
            <Button disabled>غیرفعال</Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Input / Select</CardTitle>
          <div className="mt-3 grid gap-3">
            <Input placeholder="ورودی متن" />
            <Select defaultValue="">
              <option value="" disabled>
                یک گزینه انتخاب کنید
              </option>
              <option>ایران</option>
              <option>ترکیه</option>
              <option>کانادا</option>
            </Select>
          </div>
        </Card>

        <Card>
          <CardTitle>Badge</CardTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>خنثی</Badge>
            <Badge tone="success">موفق</Badge>
            <Badge tone="warning">هشدار</Badge>
            <Badge tone="error">خطا</Badge>
          </div>
        </Card>

        <Card>
          <CardTitle>Toast</CardTitle>
          <div className="mt-3">
            <ToastDemo />
          </div>
        </Card>

        <Card>
          <CardTitle>Dialog / Sheet</CardTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            <Dialog
              trigger={<Button size="sm">باز کردن Dialog</Button>}
              title="عنوان دیالوگ"
            >
              محتوای نمونهٔ دیالوگ.
            </Dialog>
            <Sheet
              trigger={
                <Button size="sm" variant="secondary">
                  باز کردن Sheet
                </Button>
              }
              title="پنل کناری"
            >
              محتوای نمونهٔ پنل کناری.
            </Sheet>
          </div>
        </Card>

        <Card>
          <CardTitle>ایزوله‌سازی BiDi (V-2)</CardTitle>
          <CardDescription>
            کد لاتین/عددی داخل جملهٔ فارسی با <code>{'<bdi dir="ltr">'}</code>{" "}
            ایزوله می‌شود تا ترتیب نمایش به‌هم نریزد.
          </CardDescription>
          <p className="mt-3">
            کد کالا: <bdi dir="ltr">SH-MW-1023</bdi> موجود است.
          </p>
        </Card>

        <Card>
          <CardTitle>Table</CardTitle>
          <div className="mt-3">
            <Table>
              <thead>
                <tr>
                  <TH>بازار</TH>
                  <TH>ارز</TH>
                  <TH>وضعیت</TH>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <TD>ایران</TD>
                  <TD>
                    <bdi dir="ltr">IRT</bdi>
                  </TD>
                  <TD>
                    <Badge tone="success">فعال</Badge>
                  </TD>
                </tr>
                <tr>
                  <TD>ترکیه</TD>
                  <TD>
                    <bdi dir="ltr">TRY</bdi>
                  </TD>
                  <TD>
                    <Badge tone="success">فعال</Badge>
                  </TD>
                </tr>
              </tbody>
            </Table>
          </div>
        </Card>
      </div>
    </ToastProvider>
  );
}
