import { useCallback, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchTool } from '@tools/registry';

export function SearchBar() {
  const [query, setQuery] = useState('');

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed) searchTool.search(trimmed);
  }, [query]);

  return (
    <div className="pw-global-search" role="search">
      <Search size={17} strokeWidth={1.8} aria-hidden />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
        placeholder="搜索地点或坐标"
        aria-label="搜索地点或坐标"
      />
      {query && (
        <button type="button" onClick={() => setQuery('')} title="清空搜索" aria-label="清空搜索">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
