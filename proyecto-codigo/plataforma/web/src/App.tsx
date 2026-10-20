import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { ErrorApi } from './api/cliente'
import { ProveedorSesion, Requiere } from './auth/sesion'
import { Marco } from './components/Marco'

import Ingresar from './paginas/Ingresar'

// Cada página se descarga cuando se abre: la primera carga queda liviana.
const AdminCorridas = lazy(() => import('./paginas/AdminCorridas'))
const AdminModelos = lazy(() => import('./paginas/AdminModelos'))
const AdminNotificaciones = lazy(() => import('./paginas/AdminNotificaciones'))
const AdminUsuarios = lazy(() => import('./paginas/AdminUsuarios'))
const Inferencia = lazy(() => import('./paginas/Inferencia'))
const Nino = lazy(() => import('./paginas/Nino'))
const Ninos = lazy(() => import('./paginas/Ninos'))
const RevisionDatos = lazy(() => import('./paginas/RevisionDatos'))
const RevisionRiesgos = lazy(() => import('./paginas/RevisionRiesgos'))
const Tablero = lazy(() => import('./paginas/Tablero'))

export function crearCliente() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (n, e) => !(e instanceof ErrorApi && e.estado < 500) && n < 2,
      },
    },
  })
}

const cliente = crearCliente()

export function Rutas() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Ingresar />} />
      <Route element={<Requiere><Marco /></Requiere>}>
        <Route index element={<Tablero />} />
        <Route path="ninos" element={<Ninos />} />
        <Route path="ninos/:sujeto" element={<Nino />} />
        <Route path="revision/datos" element={<Requiere roles={['admin', 'experto']}><RevisionDatos /></Requiere>} />
        <Route path="revision/riesgos" element={<Requiere roles={['admin', 'experto']}><RevisionRiesgos /></Requiere>} />
        <Route path="inferencia" element={<Requiere roles={['admin', 'experto']}><Inferencia /></Requiere>} />
        <Route path="admin/modelos" element={<Requiere roles={['admin']}><AdminModelos /></Requiere>} />
        <Route path="admin/corridas" element={<Requiere roles={['admin']}><AdminCorridas /></Requiere>} />
        <Route path="admin/usuarios" element={<Requiere roles={['admin']}><AdminUsuarios /></Requiere>} />
        <Route path="admin/notificaciones" element={<Requiere roles={['admin']}><AdminNotificaciones /></Requiere>} />
        <Route path="*" element={<div><h1>No existe esa página</h1><p className="mt-2 text-salvia">Revise la dirección o vuelva al tablero.</p></div>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={cliente}>
      <ProveedorSesion>
        <BrowserRouter>
          <Rutas />
        </BrowserRouter>
      </ProveedorSesion>
    </QueryClientProvider>
  )
}
