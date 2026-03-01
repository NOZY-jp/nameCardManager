"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { registerApi } from "@/lib/api/auth";
import { type RegisterFormData, registerSchema } from "@/lib/schemas/auth";
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
          {serverError && <div className={styles.authError}>{serverError}</div>}

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
          すでにアカウントをお持ちの方は <Link href="/login">ログイン</Link>
        </div>
      </CardContent>
    </Card>
  );
}
