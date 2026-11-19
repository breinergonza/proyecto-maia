// Contención de errores de dibujo: si un gráfico o una zona de la pantalla falla, solo esa zona muestra un aviso y el resto
// de la pantalla sigue funcionando. Al usuario nunca se le muestra el detalle técnico (va a la consola).
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; nombre?: string; compacto?: boolean }
type Estado = { fallo: boolean }

export class LimiteError extends Component<Props, Estado> {
  state: Estado = { fallo: false }

  static getDerivedStateFromError(): Estado { return { fallo: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error al dibujar', this.props.nombre ?? 'un componente', error, info.componentStack)
  }

  private reintentar = () => this.setState({ fallo: false })

  render() {
    if (!this.state.fallo) return this.props.children
    const { nombre, compacto } = this.props
    return (
      <div role="alert" className={compacto
        ? 'flex flex-wrap items-center gap-2 rounded-control border border-coral/30 bg-coral-tinte px-3 py-2 text-sm text-coral-hondo'
        : 'flex flex-col items-start gap-3 rounded-panel border border-coral/30 bg-coral-tinte p-4 text-sm text-coral-hondo'}>
        <p>No se pudo mostrar {nombre ?? 'esto'}. Los demás datos de la pantalla siguen disponibles.</p>
        <button type="button" onClick={this.reintentar}
          className="rounded-control border border-coral/40 bg-papel px-3 py-1 text-sm font-semibold text-coral-hondo hover:bg-coral-tinte focus-visible:outline-2 focus-visible:outline-offset-2">
          Reintentar
        </button>
      </div>
    )
  }
}

export default LimiteError
