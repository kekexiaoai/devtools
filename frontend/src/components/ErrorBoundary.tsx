import React from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'

// By defining an empty interface, we make it clear that this component
// does not accept any props of its own, while still allowing `children`.
// This resolves the linting warning about using the weak `{}` type.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ErrorBoundaryProps {}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
  isCopied?: boolean
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren<ErrorBoundaryProps>,
  State
> {
  constructor(props: React.PropsWithChildren<ErrorBoundaryProps>) {
    super(props)
    this.state = { hasError: false, isCopied: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // You can also log the error to an error reporting service
    // For now, we'll just log it to the console.
    this.setState({ errorInfo })
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo)
  }

  handleCopy = () => {
    if (this.state.error) {
      const errorText = `${this.state.error.toString()}\n${
        this.state.errorInfo?.componentStack ?? ''
      }`
      navigator.clipboard.writeText(errorText.trim()).then(
        () => {
          this.setState({ isCopied: true })
          setTimeout(() => this.setState({ isCopied: false }), 2000)
        },
        (err) => {
          console.error('Failed to copy error details:', err)
        }
      )
    }
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
          <p className="text-muted-foreground mb-6 text-center">
            {process.env.NODE_ENV !== 'development' &&
              ' If the problem persists, please consider reporting the issue.'}
          </p>
          <Button
            onClick={() => window.location.reload()}
            variant="default"
            className="mb-6"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload Page
          </Button>
          {process.env.NODE_ENV === 'development' && (
            <details className="w-full max-w-2xl" open>
              <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
                Error Details
              </summary>
              <div className="relative mt-2">
                <pre className="p-4 pr-12 bg-muted rounded-md text-destructive-foreground text-sm whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
                  {this.state.error?.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={this.handleCopy}
                >
                  {this.state.isCopied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
