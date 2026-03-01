"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginFormData } from "@/lib/schemas/auth";
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

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { toast } = useToast();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError("");
    try {
      await login(data.email, data.password);
      toast({ type: "success", message: "ログインしました" });
      router.push("/namecards");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "ログインに失敗しました。メールアドレスとパスワードを確認してください。";
      setServerError(message);
    }
  };

  return (
    <Card className={styles.authCard}>
      <CardHeader className={styles.authHeader}>
        <CardTitle className={styles.authTitle}>ログイン</CardTitle>
        <CardDescription className={styles.authDescription}>
          名刺管理アプリケーションにログイン
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
              {...register("email")}
            />
          </div>

          <div className={styles.fieldGroup}>
            <Label htmlFor="password" required>
              パスワード
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="パスワードを入力"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register("password")}
            />
          </div>

          <Button
            type="submit"
            loading={isSubmitting}
            className={styles.submitButton}
          >
            ログイン
          </Button>
        </form>

        <div className={styles.authFooter}>
          アカウントをお持ちでない方は{" "}
          <Link href="/register">新規登録</Link>
        </div>
      </CardContent>
    </Card>
  );
}
