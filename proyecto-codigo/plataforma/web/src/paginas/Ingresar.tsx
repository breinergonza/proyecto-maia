import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { ErrorApi } from '../api/cliente'
import { useSesion } from '../auth/sesion'
import { AvisoDemo, Marca } from '../components/Marco'
import { Aviso, Boton, Campo, Entrada } from '../components/ui'

const esquema = z.object({
  email: z.string().trim().min(1, 'Escriba su correo.').email('Ese correo no es válido.'),
  clave: z.string().min(1, 'Escriba su contraseña.'),
})
type Datos = z.infer<typeof esquema>

const PALABRAS = ['su historia', 'cómo crece', 'qué revisar', 'lo que se puede prevenir']
const CINTA = ['Anomalías por capa', 'Riesgo de desenlaces prevenibles', 'Crecimiento frente a la OMS',
  'IA interpretable', 'Revisión de expertos', 'Códigos seudonimizados', 'Programa Madre Canguro']

/** Retraso de una animación de entrada, para escalonar los elementos. */
const tras = (s: number): CSSProperties => ({ animationDelay: `${s}s` })

export default function Ingresar() {
  const { usuario, cargando, ingresar } = useSesion()
  const ir = useNavigate()
  const lugar = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [verClave, setVerClave] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Datos>({ resolver: zodResolver(esquema) })

  if (!cargando && usuario) return <Navigate to="/" replace />

  const enviar = async (d: Datos) => {
    setError(null)
    try {
      await ingresar(d.email, d.clave)
      ir((lugar.state as { desde?: string } | null)?.desde ?? '/', { replace: true })
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No hubo respuesta de la API. Revise su conexión.')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-papel">
      <AvisoDemo />
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[1.15fr_1fr]">
        <section className="relative isolate flex flex-col justify-between gap-8 overflow-hidden bg-teal-hondo px-6 pb-14 pt-6 text-white sm:px-10 lg:px-14 lg:pb-0 lg:pt-12">
          <Fondo />
          <div className="animate-aparecer"><Marca claro /></div>

          <div className="max-w-[30rem]">
            <p className="animate-subir text-sm font-medium uppercase tracking-[0.18em] text-white/55" style={tras(0.1)}>
              Programa Madre Canguro
            </p>
            <p className="mt-3 animate-subir text-[1.75rem] font-bold leading-[1.12] tracking-tight sm:text-4xl lg:text-[2.75rem]" style={tras(0.2)}>
              Cada visita del niño prematuro cuenta <PalabraRotativa />
            </p>
            <p className="mt-4 hidden max-w-[40ch] animate-subir text-white/70 sm:block lg:text-lg" style={tras(0.35)}>
              El observatorio lee la historia completa: señala los datos que conviene revisar y ordena a los niños por
              el riesgo de lo que se puede prevenir.
            </p>
          </div>

          <div className="hidden lg:block"><Trayectoria /></div>
          <Cinta />
        </section>

        <section className="relative z-10 -mt-6 flex flex-1 items-start justify-center rounded-t-[1.75rem] bg-papel px-6 pb-10 pt-8 sm:px-10 lg:mt-0 lg:items-center lg:rounded-none lg:py-12">
          <form onSubmit={handleSubmit(enviar)} className="w-full max-w-sm space-y-6" noValidate>
            <div className="animate-subir" style={tras(0.25)}>
              <h1>Ingresar</h1>
              <p className="mt-1.5 text-salvia">Use el correo y la contraseña que le dio la administración.</p>
            </div>
            {error && <Aviso>{error}</Aviso>}
            <div className="animate-subir space-y-4" style={tras(0.35)}>
              <Campo id="email" etiqueta="Correo" error={errors.email?.message}>
                <Entrada id="email" type="email" inputMode="email" autoComplete="username" autoFocus
                  placeholder="nombre@fundacion.org" aria-invalid={!!errors.email} {...register('email')} />
              </Campo>
              <Campo id="clave" etiqueta="Contraseña" error={errors.clave?.message}>
                <div className="relative">
                  <Entrada id="clave" type={verClave ? 'text' : 'password'} autoComplete="current-password"
                    className="pr-12" aria-invalid={!!errors.clave} {...register('clave')} />
                  <button type="button" onClick={() => setVerClave((v) => !v)}
                    aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={verClave}
                    className="absolute inset-y-0 right-1 my-auto grid size-9 place-items-center rounded-control text-salvia transition-colors hover:bg-fondo hover:text-tinta">
                    {verClave ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  </button>
                </div>
              </Campo>
            </div>
            <div className="animate-subir" style={tras(0.45)}>
              <Boton type="submit" className="group w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Ingresando…' : 'Ingresar'}
                {!isSubmitting && <ArrowRight size={18} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />}
              </Boton>
            </div>
            <p className="animate-aparecer text-center text-xs text-salvia" style={tras(0.6)}>
              Apoyo a la decisión, no diagnóstico.
            </p>
          </form>
        </section>
      </div>
    </div>
  )
}

/** El final del titular cambia cada pocos segundos; los lectores de pantalla leen la frase completa una vez. */
function PalabraRotativa() {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setI((n) => (n + 1) % PALABRAS.length), 2800)
    return () => window.clearInterval(t)
  }, [])
  return (
    <>
      <span className="sr-only">{PALABRAS[0]}.</span>
      {/* todas en la misma celda: el alto lo fija la más larga, aunque ocupe dos líneas en un teléfono */}
      <span aria-hidden className="grid overflow-hidden">
        {PALABRAS.map((p, n) => (
          <span key={n === i ? `v${i}` : n}
            className={n === i
              ? '[grid-area:1/1] animate-subir bg-gradient-to-r from-[#f4a38c] via-coral to-[#f2c879] bg-clip-text pb-1 text-transparent'
              : 'invisible [grid-area:1/1]'}>
            {p}.
          </span>
        ))}
      </span>
    </>
  )
}

/** Cinta de texto en movimiento continuo; la lista va dos veces para que el bucle no tenga corte. */
function Cinta() {
  const elementos = [...CINTA, ...CINTA]
  return (
    <div aria-hidden className="relative -mx-6 overflow-hidden border-t border-white/10 py-4 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)] sm:-mx-10 lg:-mx-14">
      <div className="flex w-max animate-cinta gap-8 whitespace-nowrap text-sm text-white/55">
        {elementos.map((t, n) => (
          <span key={n} className="flex items-center gap-8">
            {t}<span className="size-1 rounded-full bg-coral/80" />
          </span>
        ))}
      </div>
    </div>
  )
}

/** Manchas de color que flotan despacio detrás del texto. */
function Fondo() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -left-24 -top-24 size-80 animate-flotar rounded-full bg-teal-medio/50 blur-3xl" />
      <div className="absolute -right-16 top-1/3 size-72 animate-flotar rounded-full bg-[#1f6f6a]/40 blur-3xl" style={tras(-3)} />
      <div className="absolute -bottom-20 left-1/4 size-64 animate-flotar rounded-full bg-coral/15 blur-3xl" style={tras(-6)} />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px)] [background-size:22px_22px]" />
    </div>
  )
}

/** Una curva de crecimiento que se dibuja sola, con sus visitas: la idea del observatorio, sin datos de nadie. */
function Trayectoria() {
  const puntos = [[0, 150], [60, 128], [130, 104], [210, 92], [300, 70], [390, 58], [470, 40]]
  const d = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  return (
    <svg viewBox="-10 0 500 190" className="w-full max-w-lg" aria-hidden>
      <path d="M-10,175 C150,150 300,95 490,60 L490,110 C300,140 150,180 -10,190 Z" fill="white" opacity="0.06" />
      <path d={d} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
        pathLength={1} strokeDasharray={1} className="animate-trazar" />
      {puntos.map(([x, y], i) => i === 4 ? (
        <g key={i} className="animate-aparecer" style={tras(0.3 + i * 0.32)}>
          <circle cx={x} cy={y} r={7} fill="#D9694C" className="animate-latir [transform-box:fill-box] [transform-origin:center]" />
          <circle cx={x} cy={y} r={7} fill="#D9694C" />
        </g>
      ) : (
        <circle key={i} cx={x} cy={y} r={4.5} fill="white" className="animate-aparecer" style={tras(0.3 + i * 0.32)} />
      ))}
    </svg>
  )
}
