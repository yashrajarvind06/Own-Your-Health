import * as React from "react";

interface CardProps {
    children: React.ReactNode;
    className?: string;
    title?: React.ReactNode;
    description?: string;
}

export function Card({ children, className = "", title, description }: CardProps) {
    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
            {(title || description) && (
                <div className="px-6 py-4 border-b border-gray-50">
                    {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
                    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
                </div>
            )}
            <div className="p-6">{children}</div>
        </div>
    );
}
