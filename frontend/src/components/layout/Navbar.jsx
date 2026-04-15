export default function Navbar() {
    const handleScroll = (id) => {
        document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
    };

  return (
    <nav className="flex items-center justify-between px-10 py-3.5 border-b border-fp-border bg-fp-bg sticky top-0 z-50">
      
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-fp-accent" />
        <span className="text-sm font-semibold text-fp-text">FocalPoint</span>
      </div>

      {/* Nav links */}
      <div className="flex gap-7">
        <button onClick={() => handleScroll('features')} className="text-sm text-fp-muted hover:text-fp-text transition-colors">Features</button>
        <button onClick={() => handleScroll('how-it-works')} className="text-sm text-fp-muted hover:text-fp-text transition-colors">How it works</button>
        <button onClick={() => handleScroll('install')} className="text-sm text-fp-muted hover:text-fp-text transition-colors">Install</button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <a href="/login" className="text-sm text-fp-muted hover:text-fp-text transition-colors">Sign in</a>
        <a href="/register" className="bg-fp-accent text-white text-xs font-medium px-4 py-1.5 rounded-lg hover:bg-indigo-600 transition-colors">Get started free</a>
      </div>
    </nav>
  );
}