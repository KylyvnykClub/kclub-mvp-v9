import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "kclub";

const rows = [
  {
    name: "Aurora Consulting",
    city: "Warsaw",
    category: "Consulting",
    status: "Approved",
  },
  {
    name: "Vitrum Studio",
    city: "Kyiv",
    category: "Design",
    status: "Approved",
  },
  {
    name: "Nordwind Logistics",
    city: "Riga",
    category: "Logistics",
    status: "Pending",
  },
];

export function PartnersTable() {
  return (
    <Table>
      <TableCaption>Companies awaiting the next moderation pass.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead>City</TableHead>
          <TableHead>Category</TableHead>
          <TableHead style={{ textAlign: "right" }}>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.name}>
            <TableCell style={{ fontWeight: 600 }}>{row.name}</TableCell>
            <TableCell>{row.city}</TableCell>
            <TableCell>{row.category}</TableCell>
            <TableCell style={{ textAlign: "right" }}>
              <Badge
                variant={row.status === "Approved" ? "default" : "secondary"}
              >
                {row.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
