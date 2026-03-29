export declare function boxTop(width: number): string;
export declare function boxBottom(width: number): string;
export declare function boxDivider(width: number): string;
export declare function boxRow(content: string, width: number): string;
interface TableOptions {
    minColWidth?: number;
    totalWidth?: number;
}
export declare function formatTable(headers: string[], rows: string[][], options?: TableOptions): string;
export declare function formatStatusSymbol(status: 'active' | 'idle' | 'unknown'): string;
export {};
