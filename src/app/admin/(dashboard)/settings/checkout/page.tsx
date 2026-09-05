import { Card, CardTitle, CardDescription } from "@/components/ui";

export default function CheckoutSettings() {
  return (
    <>
      <h1 className="text-2xl font-semibold">پرداخت و تسویه</h1>
      <Card className="mt-4 max-w-lg">
        <CardTitle>به‌زودی</CardTitle>
        <CardDescription>
          تنظیمات روش پرداخت، حساب‌های بانکی و مهلت‌ها در فاز ۰۳ از همین‌جا قابل
          ویرایش می‌شود.
        </CardDescription>
      </Card>
    </>
  );
}
