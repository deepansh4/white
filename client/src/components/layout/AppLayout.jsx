import React from 'react';

export const AppLayout = ({ children }) => (
  <div className="w-screen h-screen overflow-hidden bg-canvas-bg font-body text-ink">
    {children}
  </div>
);