"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterFormData } from "@/lib/schemas/auth";
import { registerApi } from "@/lib/api/auth";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import styles from "../auth.module.scss";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { toast } = useToast();
  const [serverError, setServerError] = useState("");

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError("");
    try {
      const res = await registerApi(data);
      localStorage.setItem("access_token", res.access_token);
      if (res.refresh_token) {
        localStorage.setItem("refresh_token", res.refresh_token);
      }
      // Auto-login after registration by logging in through context
      await login(data.email, data.password);
      toast({ type: "success", message: "アカウントを作成しました" });
      router.push("/namecards");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "登録に失敗しました。別のメールアドレスをお試しください。";
      setServerError(message);
    }
  };

  return (
    <Card className={styles.authCard}>
      <CardHeader className={styles.authHeader}>
        <CardTitle className={styles.authTitle}>新規登録</CardTitle>
        <CardDescription className={styles.authDescription}>
          名刺管理アプリケーションのアカウントを作成
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className={styles.authForm}>
          {serverError && (
            <div className={styles.authError}>{serverError}</div>
          )}

          <div className={styles.fieldGroup}>
            <Label htmlFor="email" required>
              メールアドレス
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="mail@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...registerField("email")}
            />
          </div>

          <div className={styles.fieldGroup}>
            <Label htmlFor="password" required>
              パスワード
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="8文字以上のパスワード"
              autoComplete="new-password"
              error={errors.password?.message}
              {...registerField("password")}
            />
          </div>

          <Button
            type="submit"
            loading={isSubmitting}
            className={styles.submitButton}
          >
            アカウント作成
          </Button>
        </form>

        <div className={styles.authFooter}>
          すでにアカウントをお持ちの方は{" "}
          <Link href="/login">ログイン</Link>
        </div>
      </CardContent>
    </Card>
  );
}
