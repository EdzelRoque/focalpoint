import Navbar from "../components/layout/Navbar"
import HeroSection from "../components/landing/HeroSection"
import FeaturesSection from "../components/landing/FeaturesSection"
import HowItWorksSection from "../components/landing/HowItWorksSection"
import InstallSection from "../components/landing/InstallSection"
import Footer from "../components/layout/Footer"

export default function LandingPage() {
  return (
    <div className="bg-fp-bg min-h-screen text-fp-text">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <InstallSection />
      <Footer />
    </div>
  );
}
