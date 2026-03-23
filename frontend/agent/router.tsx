import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from '../App';
import RagWorkspace from '../routes/RagWorkspace';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />
  },
  {
    path: '/documents',
    element: <RagWorkspace />
  }
]);

export default function AgentRouter() {
  return <RouterProvider router={router} />;
}
