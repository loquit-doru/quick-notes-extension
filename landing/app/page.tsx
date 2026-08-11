import { SiteHeader } from "@/components/SiteHeader";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { Features } from "@/components/Features";
import { Screenshots } from "@/components/Screenshots";
import { Privacy } from "@/components/Privacy";
import { Cta } from "@/components/Cta";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Problem />
        <Features />
        <Screenshots />
        <Privacy />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
