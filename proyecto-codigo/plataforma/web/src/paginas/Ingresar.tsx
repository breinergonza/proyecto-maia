import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { ErrorApi } from '../api/cliente'
import { useSesion } from '../auth/sesion'
import { AvisoDemo } from '../components/Marco'
import { Aviso, Boton, Campo, Entrada } from '../components/ui'

const esquema = z.object({
  email: z.string().trim().min(1, 'Escriba su correo.').email('Ese correo no es válido.'),
  clave: z.string().min(1, 'Escriba su contraseña.'),
})
type Datos = z.infer<typeof esquema>

export default function Ingresar() {
  const { usuario, cargando, ingresar } = useSesion()
  const ir = useNavigate()
  const lugar = useLocation()
  const [error, setError] = useState<string | null>(null)
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
    <div className="flex min-h-screen flex-col">
      <AvisoDemo />
      <div className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
        <section className="relative hidden overflow-hidden bg-teal px-12 py-16 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-lg font-bold">Observatorio Canguro</p>
            <p className="text-white/70">Programa Madre Canguro · Fundación Canguro</p>
          </div>
          <div className="max-w-[34ch]">
            <p className="text-[2.6rem] font-bold leading-[1.1]">Cada visita del niño prematuro cuenta una parte de su historia.</p>
            <p className="mt-5 text-lg text-white/80">
              Este observatorio la lee completa: señala los datos que conviene revisar y ordena a los niños por el riesgo de
              lo que se puede prevenir.
            </p>
          </div>
          <Trayectoria />
        </section>
        <section className="flex items-center justify-center px-4 py-12">
          <form onSubmit={handleSubmit(enviar)} className="w-full max-w-sm space-y-5" noValidate>
            <div>
              <h1>Ingresar</h1>
              <p className="mt-1 text-salvia">Use el correo y la contraseña que le dio la administración.</p>
            </div>
            {error && <Aviso>{error}</Aviso>}
            <Campo id="email" etiqueta="Correo" error={errors.email?.message}>
              <Entrada id="email" type="email" autoComplete="username" autoFocus aria-invalid={!!errors.email} {...register('email')} />
            </Campo>
            <Campo id="clave" etiqueta="Contraseña" error={errors.clave?.message}>
              <Entrada id="clave" type="password" autoComplete="current-password" aria-invalid={!!errors.clave} {...register('clave')} />
            </Campo>
            <Boton type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Ingresando…' : 'Ingresar'}</Boton>
          </form>
        </section>
      </div>
    </div>
  )
}

/** Una curva de crecimiento con sus visitas: la idea del observatorio, sin datos de nadie. */
function Trayectoria() {
  const puntos = [[0, 150], [60, 128], [130, 104], [210, 92], [300, 70], [390, 58], [470, 40]]
  const d = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  return (
    <svg viewBox="-10 0 500 190" className="w-full max-w-lg" aria-hidden>
      <path d="M-10,175 C150,150 300,95 490,60 L490,110 C300,140 150,180 -10,190 Z" fill="white" opacity="0.07" />
      <path d={d} fill="none" stroke="white" strokeOpacity="0.8" strokeWidth="2.5" strokeLinejoin="round" />
      {puntos.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 4 ? 7 : 4.5} fill={i === 4 ? '#D9694C' : 'white'} />
      ))}
    </svg>
  )
}
