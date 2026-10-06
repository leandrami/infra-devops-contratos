import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity("contracts")
export class Contract {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "varchar", length: 255 })
  userId!: string;

  @Column({ type: "text", nullable: true })
  description!: string;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  value!: number;

  @Column({ type: "varchar", length: 50, default: "active" })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
