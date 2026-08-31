import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "kclub";

export function CategorySelect() {
  return (
    <Select open defaultValue="consulting">
      <SelectTrigger style={{ width: 260 }}>
        <SelectValue placeholder="Business category" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="consulting">Consulting</SelectItem>
        <SelectItem value="design">Design</SelectItem>
        <SelectItem value="logistics">Logistics</SelectItem>
        <SelectItem value="hospitality">Hospitality</SelectItem>
      </SelectContent>
    </Select>
  );
}
