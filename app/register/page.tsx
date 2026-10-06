import AuthForm from "../auth-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Daftar — STEM Studio" };
export default function Page() { return <AuthForm mode="register" registrationEnabled={process.env.AUTH_REGISTRATION_ENABLED === "true"} />; }
