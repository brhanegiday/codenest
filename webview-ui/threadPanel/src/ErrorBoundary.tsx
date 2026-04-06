import { Component, ErrorInfo, ReactNode } from 'react';

interface Props  { children: ReactNode }
interface State  { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Post to extension host so it can log to the output channel
    try {
      // acquireVsCodeApi is global in the webview context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).vscodeApi?.postMessage({
        type:    'error',
        message: error.message,
        stack:   info.componentStack ?? '',
      });
    } catch { /* ignore */ }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '16px',
          color: 'var(--vscode-inputValidation-errorForeground, #f48771)',
          fontFamily: 'var(--vscode-font-family, system-ui)',
          fontSize: '13px',
          lineHeight: '1.5',
        }}>
          <strong>CodeNest: Something went wrong</strong>
          <pre style={{
            marginTop: '8px',
            fontSize: '11px',
            opacity: 0.7,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {this.state.error.message}
          </pre>
          <button
            style={{
              marginTop: '12px',
              padding: '4px 10px',
              background: 'var(--vscode-button-background, #0078d4)',
              color: 'var(--vscode-button-foreground, #fff)',
              border: 'none', borderRadius: '3px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '12px',
            }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
