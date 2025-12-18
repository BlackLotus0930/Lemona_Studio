import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DocumentList from './pages/DocumentList'
import DocumentEditorPage from './pages/DocumentEditorPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/documents" replace />} />
        <Route path="/documents" element={<DocumentList />} />
        <Route path="/document/:id" element={<DocumentEditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

