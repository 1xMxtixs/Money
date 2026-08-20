import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Money</h1>
        <p className="text-muted-foreground">
          Finanzas personales privadas, claras y en calma.
        </p>
        <div className="pt-4">
          <Button>Comenzar</Button>
        </div>
      </div>
    </main>
  );
}
