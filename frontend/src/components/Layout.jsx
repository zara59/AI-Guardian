import Sidebar from './Sidebar';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64 min-h-screen flex flex-col">
        <div className="flex-1 pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}