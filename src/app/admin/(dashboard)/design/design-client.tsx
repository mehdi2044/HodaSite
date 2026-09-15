"use client";
import { useTranslations } from "next-intl";

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
  const legacy = useTranslations("foundationAdmin");

  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => toast(legacy("savedToast"), "success")}>
        {" "}
        {legacy("successToast")}{" "}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => toast(legacy("saveError"), "error")}
      >
        {" "}
        {legacy("errorToast")}{" "}
      </Button>
    </div>
  );
}

type BidiText = {
  title: string;
  descriptionBefore: string;
  descriptionAfter: string;
  sampleBefore: string;
  sampleAfter: string;
};

export function DesignClient({ bidi }: { bidi: BidiText }) {
  const legacy = useTranslations("foundationAdmin");

  return (
    <ToastProvider>
      <h1>{legacy("design")}</h1>
      <p className="text-muted">
        {" "}
        {legacy("componentsFrom")} <code>src/components/ui</code>{" "}
        {legacy("themeTokens")}{" "}
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>Button</CardTitle>
          <CardDescription>{legacy("buttonVariants")}</CardDescription>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button>{legacy("primary")}</Button>
            <Button variant="secondary">{legacy("secondary")}</Button>
            <Button variant="ghost">{legacy("ghost")}</Button>
            <Button variant="destructive">{legacy("delete")}</Button>
            <Button size="sm">{legacy("small")}</Button>
            <Button disabled>{legacy("inactive")}</Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Input / Select</CardTitle>
          <div className="mt-3 grid gap-3">
            <Input placeholder={legacy("textInput")} />
            <Select defaultValue="">
              <option value="" disabled>
                {" "}
                {legacy("selectOption")}{" "}
              </option>
              <option>{legacy("iran")}</option>
              <option>{legacy("turkey")}</option>
              <option>{legacy("canada")}</option>
            </Select>
          </div>
        </Card>

        <Card>
          <CardTitle>Badge</CardTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{legacy("neutral")}</Badge>
            <Badge tone="success">{legacy("success")}</Badge>
            <Badge tone="warning">{legacy("warning")}</Badge>
            <Badge tone="error">{legacy("error")}</Badge>
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
              trigger={<Button size="sm">{legacy("openDialog")}</Button>}
              title={legacy("dialogTitle")}
            >
              {" "}
              {legacy("dialogContent")}{" "}
            </Dialog>
            <Sheet
              trigger={
                <Button size="sm" variant="secondary">
                  {" "}
                  {legacy("openSheet")}{" "}
                </Button>
              }
              title={legacy("sheetTitle")}
            >
              {" "}
              {legacy("sheetContent")}{" "}
            </Sheet>
          </div>
        </Card>

        <Card>
          <CardTitle>{bidi.title}</CardTitle>
          <CardDescription>
            {bidi.descriptionBefore} <code>{'<bdi dir="ltr">'}</code>{" "}
            {bidi.descriptionAfter}
          </CardDescription>
          <p className="mt-3">
            {bidi.sampleBefore} <bdi dir="ltr">SH-MW-1023</bdi>{" "}
            {bidi.sampleAfter}
          </p>
        </Card>

        <Card>
          <CardTitle>Table</CardTitle>
          <div className="mt-3">
            <Table>
              <thead>
                <tr>
                  <TH>{legacy("market")}</TH>
                  <TH>{legacy("currency")}</TH>
                  <TH>{legacy("status")}</TH>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <TD>{legacy("iran")}</TD>
                  <TD>
                    <bdi dir="ltr">IRT</bdi>
                  </TD>
                  <TD>
                    <Badge tone="success">{legacy("active")}</Badge>
                  </TD>
                </tr>
                <tr>
                  <TD>{legacy("turkey")}</TD>
                  <TD>
                    <bdi dir="ltr">TRY</bdi>
                  </TD>
                  <TD>
                    <Badge tone="success">{legacy("active")}</Badge>
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
