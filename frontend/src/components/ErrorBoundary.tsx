import React from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from './ui/button'

// By defining an empty interface, we make it clear that this component
// does not accept any props of its own, while still allowing `children`.
// This resolves the linting warning about using the weak `{}` type.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ErrorBoundaryProps {}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren<ErrorBoundaryProps>,
  State
> {
  constructor(props: React.PropsWithChildren<ErrorBoundaryProps>) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // You can also log the error to an error reporting service
    // For now, we'll just log it to the console.
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
          <h1 className="text-2xl font-bold mb-4 text-destructive">
            Oops! Something went wrong.
          </h1>
          <p className="text-muted-foreground mb-6 text-center">
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <Button
            onClick={() => window.location.reload()}
            variant="default"
            className="mb-6"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload Page
          </Button>
          <pre className="p-4 bg-muted rounded-md text-destructive-foreground text-sm whitespace-pre-wrap w-full max-w-2xl">
            {this.state.error?.stack || this.state.error?.toString()}
          </pre>
        </div>
      )
    }

    return this.props.children
  }
}
